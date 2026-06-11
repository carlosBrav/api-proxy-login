# ==========================================
# WEBSOCKET API GATEWAY V2 & CONNECTIONS
# ==========================================

# 1. DynamoDB Table for Connections
resource "aws_dynamodb_table" "ws_connections" {
  name         = "ws-connections-${local.sufix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = var.tags
}

# 2. Secrets Manager for JWT Secret
resource "aws_secretsmanager_secret" "ws_jwt_secret" {
  name        = "ws-jwt-secret-${local.sufix}"
  description = "Secret key for signing WebSocket JWTs"
  tags        = var.tags
}

resource "aws_secretsmanager_secret_version" "ws_jwt_secret_val" {
  secret_id     = aws_secretsmanager_secret.ws_jwt_secret.id
  secret_string = "replace-me-in-production"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# 3. Cognito Identity Pool (Guest Only)
resource "aws_cognito_identity_pool" "guest_pool" {
  identity_pool_name               = "guest_pool_${replace(local.sufix, "-", "_")}"
  allow_unauthenticated_identities = true

  tags = var.tags
}

resource "aws_iam_role" "guest_role" {
  name = "cognito_guest_role_${local.sufix}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.guest_pool.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "unauthenticated"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "guest_policy" {
  name = "cognito_guest_policy_${local.sufix}"
  role = aws_iam_role.guest_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "mobileanalytics:PutEvents",
          "cognito-sync:*"
        ]
        Resource = ["*"]
      }
    ]
  })
}

resource "aws_cognito_identity_pool_roles_attachment" "guest_roles" {
  identity_pool_id = aws_cognito_identity_pool.guest_pool.id

  roles = {
    "unauthenticated" = aws_iam_role.guest_role.arn
  }
}

# 4. Lambdas
module "lambda_fn_ws_guest_session" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-ws-guest-session"
  function_name   = local.lambdas_files_name[60]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    COGNITO_IDENTITY_POOL_ID = aws_cognito_identity_pool.guest_pool.id
    WS_JWT_SECRET            = aws_secretsmanager_secret_version.ws_jwt_secret_val.secret_string
    WS_API_ENDPOINT          = aws_apigatewayv2_stage.ws_stage.invoke_url
    WS_TOKEN_EXPIRES_IN      = "3600" # Configurable TTL in seconds
    IS_OFFLINE               = "false"
  }
}

module "lambda_fn_ws_session" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-ws-session"
  function_name   = local.lambdas_files_name[61]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    WS_JWT_SECRET       = aws_secretsmanager_secret_version.ws_jwt_secret_val.secret_string
    WS_API_ENDPOINT     = aws_apigatewayv2_stage.ws_stage.invoke_url
    WS_TOKEN_EXPIRES_IN = "3600" # Configurable TTL in seconds
    IS_OFFLINE          = "false"
  }
}

module "lambda_fn_ws_connect" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-ws-connect"
  function_name   = local.lambdas_files_name[62]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    WS_CONNECTIONS_TABLE = aws_dynamodb_table.ws_connections.name
    WS_JWT_SECRET        = aws_secretsmanager_secret_version.ws_jwt_secret_val.secret_string
    IS_OFFLINE           = "false"
  }
}

module "lambda_fn_ws_disconnect" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-ws-disconnect"
  function_name   = local.lambdas_files_name[63]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    WS_CONNECTIONS_TABLE = aws_dynamodb_table.ws_connections.name
    IS_OFFLINE           = "false"
  }
}

# 5. REST API Integrations
resource "aws_api_gateway_resource" "ws" {
  rest_api_id = module.apigateway_api_rest_altenar.id
  parent_id   = module.apigateway_api_rest_altenar.root_resource_id
  path_part   = "ws"
}

module "apigateway_integrations_ws_guest_session" {
  source               = "./modules/apigateway/integration"
  environment          = var.tags.environment
  api_id               = module.apigateway_api_rest_altenar.id
  api_execution_arn    = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id = aws_api_gateway_resource.ws.id
  path_resource        = "guest-session"
  enable_cors          = true
  methods = [
    {
      http_method       = "POST"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_ws_guest_session.invoke_arn
      lambda_fn_name    = module.lambda_fn_ws_guest_session.function_name
    }
  ]
}

module "apigateway_integrations_ws_session" {
  source               = "./modules/apigateway/integration"
  environment          = var.tags.environment
  api_id               = module.apigateway_api_rest_altenar.id
  api_execution_arn    = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id = aws_api_gateway_resource.ws.id
  path_resource        = "session"
  enable_cors          = true
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_ws_session.invoke_arn
      lambda_fn_name    = module.lambda_fn_ws_session.function_name
    }
  ]
}

# 6. WebSocket API Gateway v2
resource "aws_apigatewayv2_api" "ws_api" {
  name                       = "ws-api-${local.sufix}"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
  tags                       = var.tags
}

resource "aws_apigatewayv2_stage" "ws_stage" {
  api_id      = aws_apigatewayv2_api.ws_api.id
  name        = "prod"
  auto_deploy = true
}

# Connect Route
resource "aws_apigatewayv2_integration" "ws_connect" {
  api_id           = aws_apigatewayv2_api.ws_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = module.lambda_fn_ws_connect.invoke_arn
}

resource "aws_apigatewayv2_route" "ws_connect" {
  api_id    = aws_apigatewayv2_api.ws_api.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_connect.id}"
}

resource "aws_lambda_permission" "ws_connect" {
  statement_id  = "AllowExecutionFromAPIGatewayConnect"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda_fn_ws_connect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws_api.execution_arn}/*/*"
}

# Disconnect Route
resource "aws_apigatewayv2_integration" "ws_disconnect" {
  api_id           = aws_apigatewayv2_api.ws_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = module.lambda_fn_ws_disconnect.invoke_arn
}

resource "aws_apigatewayv2_route" "ws_disconnect" {
  api_id    = aws_apigatewayv2_api.ws_api.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_disconnect.id}"
}

resource "aws_lambda_permission" "ws_disconnect" {
  statement_id  = "AllowExecutionFromAPIGatewayDisconnect"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda_fn_ws_disconnect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws_api.execution_arn}/*/*"
}

# Default Route (Optional, just to avoid errors if clients send random messages)
resource "aws_apigatewayv2_integration" "ws_default" {
  api_id           = aws_apigatewayv2_api.ws_api.id
  integration_type = "MOCK"
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_apigatewayv2_route" "ws_default" {
  api_id    = aws_apigatewayv2_api.ws_api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.ws_default.id}"
}

# Additional IAM policy for the execution role to allow API Gateway Management API (for eviction)
resource "aws_iam_role_policy" "ws_management_api" {
  name = "ws_management_api_${local.sufix}"
  role = split("/", var.role_arn)[1] # Extracts the role name from ARN

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "execute-api:ManageConnections"
        ]
        Resource = [
          "${aws_apigatewayv2_api.ws_api.execution_arn}/*/*/@connections/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:DeleteItem",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          aws_dynamodb_table.ws_connections.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-identity:GetId"
        ]
        Resource = [
          "*"
        ]
      }
    ]
  })
}
