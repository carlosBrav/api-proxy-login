variable "user_pool_id" {
  description = "Id del pool de usuarios de cognito"
  type        = string
}

variable "name" {
  description = "Nombre del cliente dentro de user pool"
  type        = string
}

variable "refesh_token_validity" {
  description = "Tiempo de vida del refresh token"
  type        = number
  default     = 5
}

variable "access_token_validity" {
  description = "Tiempo de vida del access token"
  type        = number
  default     = 1
}

variable "id_token_validity" {
  description = "Tiempo de vida del id token"
  type        = number
  default     = 1
}

variable "auth_session_validity" {
  description = "Duracion del flujo del session de autenticacion"
  type        = number
  default     = 3
}

variable "refesh_token_time" {
  description = "Tiempo del refresh token"
  type        = string
  default     = "days"
}

variable "access_token_time" {
  description = "Tiempo del access token"
  type        = string
  default     = "hours"
}

variable "id_token_time" {
  description = "Tiempo del id token"
  type        = string
  default     = "hours"
}
