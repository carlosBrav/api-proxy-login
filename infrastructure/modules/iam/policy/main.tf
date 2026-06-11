resource "aws_iam_policy" "invoke_fn_lambda" {
  name = var.policy_name

  policy = jsonencode({
    Version = var.policy_version
    Statement = [
      {
        Effect   = "Allow"
        Action   = var.actions
        Resource = var.resource_arns
      }
    ]
  })
}
