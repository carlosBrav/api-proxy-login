variable "name" {
  description = "Nombre del recurso api gateway"
  type        = string
}

variable "gateway_authorizer_name" {
  description = "Nombre del autorizador del api gateway"
  type        = string
}

variable "cognito_userpool_arn" {
  description = "Arn del user pool"
  type        = string
}


