output "arn" {
  value = aws_lambda_function.lambda_function.arn
}

output "invoke_arn" {
  value = aws_lambda_function.lambda_function.invoke_arn
}

output "function_name" {
  value = aws_lambda_function.lambda_function.function_name
}

output "version" {
  value = aws_lambda_function.lambda_function.version
}
