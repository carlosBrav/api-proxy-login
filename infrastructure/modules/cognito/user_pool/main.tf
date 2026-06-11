resource "aws_cognito_user_pool" "custom_auth_pool" {
  name                     = var.name
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
