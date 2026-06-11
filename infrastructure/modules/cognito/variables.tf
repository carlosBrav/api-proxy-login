variable "user_pool_name" {
  description = "Nombre del user pool en cognito"
  type        = string
}

variable "pool_client_name" {
  description = "Nombre del cliente dentro de user pool"
  type        = string
}

variable "pool_client_url" {
  description = "URL del pool cliente"
  type        = string
}


variable "lambda_config" {
  description = "ARNs de las funciones lambda para la autenticacion personalizada del user pool"
  type        = map(string)
}