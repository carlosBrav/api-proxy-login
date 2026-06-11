variable "policy_version" {
  description = "Indica la version de la politica IAM"
  type        = string
}

variable "role_name" {
  description = "Nombre del role IAM en aws"
  type        = string
}

variable "service" {
  description = "Permiso para el rol de servicio"
  type        = string
}
