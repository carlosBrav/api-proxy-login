variable "sg_endpoint_name" {
  description = "Nombre del sg endopint"
  type        = string
}

variable "sg_redis_name" {
  description = "Nombre del sg para redis"
  type        = string
}

variable "sg_lambda_name" {
  description = "Nombre del sg para lambda"
  type        = string
}

variable "vpc_id" {
  description = "Id del vpc principal"
  type        = string
}

variable "vpc_cidr_block" {
  description = "cidr_block del vpc principal"
  type        = string
}

variable "sb_private_1_id" {
  description = "Id de la subnet privada 1"
  type        = string
}

variable "sb_private_2_id" {
  description = "Id de la subnet privada 2"
  type        = string
}
