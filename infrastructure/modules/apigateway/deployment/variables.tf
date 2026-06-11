variable "api_id" {
  description = "Identificador del recurso rest"
  type        = string
}

variable "redeployment_resources" {
  description = "Listado de recursos a desplegar"
  type        = list(string)
}

variable "environment" {
  description = "Entorno de ejecucion de la solucion"
  type        = string
}
