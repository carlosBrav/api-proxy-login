variable "sb_private_1_id" {
  description = "Id de la subnet privada 1"
  type        = string
}

variable "sb_private_2_id" {
  description = "Id de la subnet privada 2"
  type        = string
}

variable "esg_name" {
  description = "Nombre del elastic security group"
  type        = string
}

variable "ec_name" {
  description = "Nombre de elastic cache"
  type        = string
}

variable "sg_redis_id" {
  description = "Id del security group de redis"
  type        = string
}