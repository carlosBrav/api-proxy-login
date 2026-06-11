resource "aws_iam_role" "role_lambda" {
  name = var.role_name

  assume_role_policy = jsonencode({
    Version = var.policy_version
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = var.service
        }
      }
    ]
  })
}