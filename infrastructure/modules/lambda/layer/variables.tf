variable "layer_name" {
  description = "Nombre del Lambda Layer"
  type        = string
}

variable "source_dir" {
  description = "Directorio con el código del layer"
  type        = string
}

variable "output_path" {
  description = "Ruta donde se guardará el ZIP del layer"
  type        = string
}

variable "compatible_runtimes" {
  description = "Runtimes compatibles con el layer"
  type        = list(string)
  default     = ["python3.9", "python3.10", "python3.11", "python3.12"]
}

variable "description" {
  description = "Descripción del layer"
  type        = string
  default     = ""
}
