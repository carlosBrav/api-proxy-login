resource "aws_api_gateway_rest_api" "api" {
  name = var.name
  
  binary_media_types = [
    "multipart/form-data"
  ]
}

resource "aws_api_gateway_authorizer" "cognito_auth" {
  name            = var.gateway_authorizer_name
  rest_api_id     = aws_api_gateway_rest_api.api.id
  identity_source = "method.request.header.Authorization"
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [var.cognito_userpool_arn]
}