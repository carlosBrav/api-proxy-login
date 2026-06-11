output "resource_id" {
  value = aws_api_gateway_resource.resource.id
}

output "method_ids" {
  description = "Map de IDs de los métodos (key: http_method, value: id)"
  value       = { for k, m in aws_api_gateway_method.method : k => m.id }
}

output "methods" {
  description = "Métodos HTTP configurados"
  value       = [for m in aws_api_gateway_method.method : m.http_method]
}

output "integration_ids" {
  description = "Map de IDs de las integraciones (key: http_method, value: id)"
  value       = { for k, i in aws_api_gateway_integration.integration : k => i.id }
}

output "resource_path_part" {
  value = aws_api_gateway_resource.resource.path_part
}

output "resource_path" {
  value = aws_api_gateway_resource.resource.path
}

output "redeploy_fingerprint" {
  value = concat(
    ["/${var.path_resource}"],
    [for m in var.methods : "${m.http_method}|${m.authorization}|cors=${var.enable_cors}"]
  )
}