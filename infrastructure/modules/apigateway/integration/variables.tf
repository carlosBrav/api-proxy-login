variable "api_id" {
  description = "Identificador del recurso rest"
  type        = string
}

variable "api_root_resource_id" {
  description = "Identificador del recurso raiz"
  type        = string
}

variable "api_execution_arn" {
  description = "ARN de ejecucion del recurso rest"
  type        = string
}

variable "environment" {
  description = "Entorno de ejecucion de la solucion"
  type        = string
}

variable "path_resource" {
  description = "Ruta principal"
  type        = string
}

variable "enable_cors" {
  description = "Habilitar CORS con método OPTIONS"
  type        = bool
  default     = true
}

variable "cors_allow_origin" {
  description = "Origen permitido para CORS"
  type        = string
  default     = "*"
}

variable "cors_allow_methods" {
  description = "Métodos HTTP permitidos"
  type        = string
  default     = "GET,POST,PATCH,PUT,DELETE,OPTIONS"
}

variable "cors_allow_headers" {
  description = "Headers permitidos para CORS"
  type        = string
  default     = "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token"
}

variable "client_name" {
  type        = string
  description = "Nombre del cliente para identificación única"
  default     = ""
}

variable "has_client_name_in_fn" {
  type    = bool
  default = true
}

variable "methods" {
  description = "Lista de métodos HTTP con sus configuraciones de Lambda"
  type = list(object({
    http_method       = string
    lambda_invoke_arn = string
    lambda_fn_name    = string
    authorization     = optional(string)
    authorizer_id     = optional(string)
  }))
}
