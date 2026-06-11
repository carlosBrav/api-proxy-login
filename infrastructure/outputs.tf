# output "user_pool_id" {
#   value = module.cog_user_pool_custom_auth.user_pool_id
# }

# output "client_id" {
#   value = module.cog_user_pool_custom_auth.pool_client_id
# }

# output "client_domain" {
#   value = module.cog_user_pool_custom_auth.domain
# }

# output "endpoint_get_user_detail_url" {
#   value = "https://${module.apigateway_api_rest.id}.execute-api.${var.region}.amazonaws.com/${module.apigateway_deployment.stage_name}/${module.apigateway_integrations.resource_path_part}"
# }

# output "redis_node_address" {
#   value = module.elastic_cache_redis.node_address
# }