resource "aws_cognito_user_pool_client" "pool_client" {
  name         = var.name
  user_pool_id = var.user_pool_id
  explicit_auth_flows = [
    "ALLOW_CUSTOM_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
  prevent_user_existence_errors = "ENABLED"
  generate_secret               = true
  refresh_token_validity        = var.refesh_token_validity
  access_token_validity         = var.access_token_validity
  id_token_validity             = var.id_token_validity
  auth_session_validity         = var.auth_session_validity

  token_validity_units {
    refresh_token = var.refesh_token_time
    access_token  = var.access_token_time
    id_token      = var.id_token_time
  }
}
