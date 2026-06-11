data "archive_file" "functions_zip" {
  for_each    = toset(values(local.lambdas_files))
  type        = "zip"
  source_file = "${path.root}/../src/lambdas/${each.value}"
  output_path = "${path.root}/lambda_functions/${split("/", (split(".", each.value)[0]))[1]}.zip"
}

data "archive_file" "package_zip" {
  for_each = toset([
    local.lambdas_folder.verify_auth_challenge,
    local.lambdas_folder.pre_token_generation,
    local.lambdas_folder.crypto
  ])
  type        = "zip"
  source_dir  = "${path.root}/../src/lambdas/${each.value}"
  output_path = "${path.root}/lambda_functions/${split("/", each.value)[1]}.zip"
}
