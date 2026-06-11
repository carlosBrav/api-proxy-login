resource "aws_lambda_function" "lambda_function" {
  function_name    = var.lambda_name
  role             = var.role_lambda_arn
  handler          = "${var.function_name}.${var.handler_name}"
  runtime          = var.runtime
  timeout          = var.timeout
  filename         = "lambda_functions/${var.function_name}.zip"
  source_code_hash = filebase64sha256("lambda_functions/${var.function_name}.zip")
  publish          = var.is_publish
  memory_size      = var.memory_size
  architectures    = var.architectures
  # layers           = var.layers  # Comentado - pendiente pipeline

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.scg_redis_id
  }

  environment {
    variables = var.environments
  }
}



