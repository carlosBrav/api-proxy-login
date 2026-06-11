resource "aws_lambda_alias" "alias" {
  name             = var.lambda_alias
  function_name    = var.lambda_function_name
  function_version = var.lambda_function_version
}

resource "aws_lambda_provisioned_concurrency_config" "warm" {
  function_name                     = var.lambda_function_name
  qualifier                         = aws_lambda_alias.alias.name
  provisioned_concurrent_executions = var.quantity_provisioned
  depends_on                        = [aws_lambda_alias.alias]
}