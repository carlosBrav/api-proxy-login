
variable "name" {
  description = "Nombre de la monitorio logging"
  type        = string
}

variable "retention_days" {
  description = "Numero de dias a retener el log"
  type        = number
}
