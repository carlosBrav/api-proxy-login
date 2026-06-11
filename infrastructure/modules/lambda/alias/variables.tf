variable "lambda_alias" {
  description = "Alias de la funcion lambda"
  type        = string
}

variable "lambda_function_name" {
  description = "Nombre de la funcion lambda"
  type        = string
}

variable "lambda_function_version" {
  description = "Version de la funcion lambda"
  type        = string
}

variable "quantity_provisioned" {
  description = "Cantidad de instancias a aprovisionar"
  type        = number
}