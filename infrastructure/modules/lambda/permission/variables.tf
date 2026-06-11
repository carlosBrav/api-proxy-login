variable "lambda_fn_name" {
  description = "Nombre del servicio lambda"
  type        = string
}

variable "source_arn" {
  description = "ARN del user pool"
  type        = string
}

variable "statement_id" {
  description = "Indica el permiso al statement"
  type        = string
}

variable "action" {
  description = "Accion que permite invocar la funcion lambda"
  type        = string
}

variable "principal" {
  description = "Principal que invoca la funcion lambda"
  type        = string
}
