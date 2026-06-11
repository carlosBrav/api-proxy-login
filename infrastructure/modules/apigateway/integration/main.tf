
resource "aws_api_gateway_resource" "resource" {
  rest_api_id = var.api_id
  parent_id   = var.api_root_resource_id
  path_part   = var.path_resource
}

resource "aws_api_gateway_method" "method" {
  for_each = { for m in var.methods : m.http_method => m }

  rest_api_id   = var.api_id
  resource_id   = aws_api_gateway_resource.resource.id
  http_method   = each.value.http_method
  authorization = each.value.authorization
  authorizer_id = each.value.authorization == "NONE" ? null : each.value.authorizer_id
}

resource "aws_api_gateway_integration" "integration" {
  for_each = { for m in var.methods : m.http_method => m }

  rest_api_id             = var.api_id
  resource_id             = aws_api_gateway_resource.resource.id
  http_method             = aws_api_gateway_method.method[each.key].http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = each.value.lambda_invoke_arn
}

# ========================================
# OPTIONS - Solo si enable_cors = true
# ========================================
resource "aws_api_gateway_method" "options" {
  count = var.enable_cors ? 1 : 0

  rest_api_id   = var.api_id
  resource_id   = aws_api_gateway_resource.resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "options" {
  count = var.enable_cors ? 1 : 0

  rest_api_id = var.api_id
  resource_id = aws_api_gateway_resource.resource.id
  http_method = aws_api_gateway_method.options[0].http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options" {
  count = var.enable_cors ? 1 : 0

  rest_api_id = var.api_id
  resource_id = aws_api_gateway_resource.resource.id
  http_method = aws_api_gateway_method.options[0].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "options" {
  count = var.enable_cors ? 1 : 0

  rest_api_id = var.api_id
  resource_id = aws_api_gateway_resource.resource.id
  http_method = aws_api_gateway_method.options[0].http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'${var.cors_allow_headers}'"
    "method.response.header.Access-Control-Allow-Methods" = "'${var.cors_allow_methods}'"
    "method.response.header.Access-Control-Allow-Origin"  = "'${var.cors_allow_origin}'"
  }

  depends_on = [aws_api_gateway_integration.options]
}

resource "aws_lambda_permission" "api_gateway" {
  for_each      = { for m in var.methods : m.http_method => m }
  statement_id  = "AllowAPIGatewayInvoke-${var.path_resource}-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = each.value.lambda_fn_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_execution_arn}/*/*/*"
}

