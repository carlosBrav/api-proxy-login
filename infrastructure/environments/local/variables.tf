variable "catalog_table_name" {
  description = "Nombre de la tabla DynamoDB del catálogo maestro"
  type        = string
  default     = "col_maestro_transversal_juegos"
}

variable "environment" {
  description = "Etiqueta de entorno"
  type        = string
  default     = "local"
}

variable "lambda_function_name" {
  description = "Nombre de la Lambda de ingesta del catálogo"
  type        = string
  default     = "lambda-ingest-lobby"
}

variable "lambda_event_rule_name" {
  description = "Nombre de la regla EventBridge horaria"
  type        = string
  default     = "ingest-lobby-hourly"
}

variable "ingest_company" {
  description = "Parámetro company del POST getLobby"
  type        = string
  default     = "ACP"
}

variable "ingest_lobby" {
  description = "Parámetro lobby del POST getLobby"
  type        = string
  default     = "livepoker"
}

variable "get_lobby_url" {
  description = "URL del endpoint Calímaco getLobby"
  type        = string
  default     = "https://api.casinoatlanticcity.com/api/contents/getLobby"
}

variable "dynamodb_endpoint" {
  description = "Endpoint DynamoDB para la Lambda en Floci (red Docker)"
  type        = string
  default     = "http://host.docker.internal:4566"
}
