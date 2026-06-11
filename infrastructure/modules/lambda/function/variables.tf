
variable "lambda_name" {
  description = "Nombre de la funcion lambda"
  type        = string
}

variable "function_name" {
  description = "Nombre del archivo lambda"
  type        = string
}

variable "handler_name" {
  description = "Handler function name (lambda_handler for Python, handler for Node.js)"
  type        = string
  default     = "lambda_handler"
}

variable "is_publish" {
  description = "Indica si el lambda se va publicar para tener un versionamiento"
  type        = bool
}

variable "memory_size" {
  description = "Memoria ram de lambda"
  type        = number
}

variable "runtime" {
  description = "Lenguaje de programacion y version donde se va ejecutar"
  type        = string
}

variable "timeout" {
  description = "Tiempo de espera"
  type        = number
}

variable "role_lambda_arn" {
  description = "Arn del role"
  type        = string
}

variable "environments" {
  description = "Variables de entorno que se usara en el codigo"
  type        = map(string)
  default     = {}
}

variable "subnet_ids" {
  description = "Ids de las subnets privadas"
  type        = list(string)
  default     = []
}

variable "scg_redis_id" {
  description = "id security goup de redis"
  type        = list(string)
  default     = []
}

variable "architectures" {
  description = "Arquitectura de lambda"
  type        = list(string)
}

# Comentado temporalmente - pendiente implementación en pipeline
# variable "layers" {
#   description = "Lista de ARNs de Lambda Layers a adjuntar a la función"
#   type        = list(string)
#   default     = []
# }