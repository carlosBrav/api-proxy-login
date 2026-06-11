resource "aws_cognito_user_pool" "custom_auth_pool" {
  name                     = var.user_pool_name
  alias_attributes         = ["preferred_username"]
  auto_verified_attributes = []

  password_policy {
    minimum_length    = 6
    require_lowercase = false
    require_numbers   = false
    require_symbols   = false
    require_uppercase = false
  }

  schema {
    name                = "username"
    attribute_data_type = "String"
    mutable             = false
  }

  lambda_config {
    define_auth_challenge          = var.lambda_config.define_auth_challenge_arn
    create_auth_challenge          = var.lambda_config.create_auth_challenge_arn
    verify_auth_challenge_response = var.lambda_config.verify_auth_challenge_arn
    pre_token_generation           = var.lambda_config.pre_token_generation_arn
  }

  lifecycle {
    ignore_changes = [schema]
  }
}

resource "aws_cognito_user_pool_client" "pool_client" {
  name         = var.pool_client_name
  user_pool_id = aws_cognito_user_pool.custom_auth_pool.id
  explicit_auth_flows = [
    "ALLOW_CUSTOM_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
  prevent_user_existence_errors = "ENABLED"
  refresh_token_validity        = 5
  access_token_validity         = 1
  id_token_validity             = 1
  auth_session_validity         = 3
  generate_secret               = true
  callback_urls                 = [var.pool_client_url]

  token_validity_units {
    refresh_token = "days"
    access_token  = "hours"
    id_token      = "hours"
  }
}