module "catalog_dynamodb" {
  source = "../../modules/catalog-dynamodb"

  table_name = var.catalog_table_name

  tags = {
    Project     = "bff-mv-streaming-col"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
