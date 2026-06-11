
resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = var.api_id

  triggers = {
    redeployment = sha1(jsonencode(sort(distinct(flatten(var.redeployment_resources)))))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "stage" {
  deployment_id = aws_api_gateway_deployment.deployment.id
  rest_api_id   = var.api_id
  stage_name    = var.environment
}
