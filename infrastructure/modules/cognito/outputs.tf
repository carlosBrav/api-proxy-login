output "user_pool_arn" {
  value = aws_cognito_user_pool.custom_auth_pool.arn
}

output "user_pool_id" {
  value = aws_cognito_user_pool.custom_auth_pool.id
}

output "pool_client_id" {
  value = aws_cognito_user_pool_client.pool_client.id
}

output "pool_client_secret" {
  value = aws_cognito_user_pool_client.pool_client.client_secret
}

output "domain" {
  value = aws_cognito_user_pool.custom_auth_pool.domain
}