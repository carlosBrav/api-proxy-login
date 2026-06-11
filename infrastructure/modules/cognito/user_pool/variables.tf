variable "name" {
  description = "Nombre del user pool en cognito"
  type        = string
}

variable "lambda_config" {
  description = "ARNs de las funciones lambda para la autenticacion personalizada del user pool"
  type        = map(string)
}