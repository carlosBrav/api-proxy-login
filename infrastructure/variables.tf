variable "tags" {
  description = "tags por defecto del proyecto"
  type        = map(string)
}

variable "region" {
  description = "region del proyecto"
  type        = string
}

variable "bucket_name" {
  description = "Nombre del bucket"
  type        = string
}

variable "policy_version" {
  description = "Indica la version de la politica IAM"
  type        = string
}

variable "vpc_id" {
  description = "region del proyecto"
  type        = string
  sensitive   = true
}

variable "subnet_private_1_id" {
  description = "Id de la subnet privada 1"
  type        = string
  sensitive   = true
}

variable "subnet_private_2_id" {
  description = "Id de la subnet privada 2"
  type        = string
  sensitive   = true
}

variable "role_name" {
  description = "Nombre del role"
  type        = string
}

variable "role_arn" {
  description = "Arn del role"
  type        = string
  sensitive   = true
}

variable "url_api_calimaco" {
  description = "url base del api de calimaco"
  type        = string
}