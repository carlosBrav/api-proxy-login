variable "region" {
  description = "Region de ubicacion"
  type        = string
}

variable "sg_vpc_endpoint_id" {
  description = "Id del security gorup endpoint"
  type        = string
}

variable "sufix" {
  description = "Sufijo del nombre de servicio"
  type        = string
}

variable "vpc_id" {
  description = "Id del vpc principal"
  type        = string
}

variable "subnet_ids" {
  description = "Ids de las subnets privadas"
  type        = list(string)
  default     = []
}