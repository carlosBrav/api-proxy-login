output "arn" {
  value = aws_cognito_user_pool.custom_auth_pool.arn
}

output "id" {
  value = aws_cognito_user_pool.custom_auth_pool.id
}

output "domain" {
  value = aws_cognito_user_pool.custom_auth_pool.domain
}
