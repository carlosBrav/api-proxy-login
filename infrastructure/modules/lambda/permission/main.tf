resource "aws_lambda_permission" "user_pool_invokes_lambdas" {
  function_name = var.lambda_fn_name
  statement_id  = var.statement_id
  action        = var.action
  principal     = var.principal
  source_arn    = var.source_arn

}
