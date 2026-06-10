variable "table_name" {
  description = "Nombre de la tabla DynamoDB del catálogo maestro de juegos"
  type        = string
}

variable "tags" {
  description = "Tags para recursos AWS"
  type        = map(string)
  default     = {}
}
