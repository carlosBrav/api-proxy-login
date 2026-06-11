
output "id" {
  value = aws_cognito_user_pool_client.pool_client.id
}

output "secret" {
  value = aws_cognito_user_pool_client.pool_client.client_secret
}
