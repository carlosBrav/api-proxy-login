variable "policy_version" {
  description = "Indica la version de la politica IAM"
  type        = string
}

variable "policy_name" {
  description = "Nombre de la politica IAM"
  type        = string
}

variable "resource_arns" {
  description = "Arn del recurso"
  type        = list(string)
}

variable "actions" {
  description = "Accion del recurso"
  type        = list(string)
}


