data "archive_file" "layer" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = var.output_path
}

resource "aws_lambda_layer_version" "layer" {
  filename            = data.archive_file.layer.output_path
  layer_name          = var.layer_name
  compatible_runtimes = var.compatible_runtimes
  source_code_hash    = data.archive_file.layer.output_base64sha256

  description = var.description
}
