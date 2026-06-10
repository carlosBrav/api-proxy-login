variable "function_name" {
  description = "Nombre de la función Lambda de ingesta"
  type        = string
  default     = "lambda-ingest-lobby"
}

variable "event_rule_name" {
  description = "Nombre de la regla EventBridge horaria"
  type        = string
  default     = "ingest-lobby-hourly"
}

variable "catalog_table_arn" {
  description = "ARN de la tabla DynamoDB del catálogo"
  type        = string
}

variable "lambda_zip_path" {
  description = "Ruta al artefacto zip de la Lambda"
  type        = string
}

variable "lambda_source_hash" {
  description = "Hash base64sha256 del zip (archive_file.output_base64sha256)"
  type        = string
}

variable "environment_variables" {
  description = "Variables de entorno de la Lambda"
  type        = map(string)
  default     = {}
}

variable "schedule_expression" {
  description = "Expresión de programación EventBridge"
  type        = string
  default     = "rate(1 hour)"
}

variable "timeout" {
  description = "Timeout de la Lambda en segundos"
  type        = number
  default     = 60
}

variable "tags" {
  description = "Tags para recursos AWS"
  type        = map(string)
  default     = {}
}
