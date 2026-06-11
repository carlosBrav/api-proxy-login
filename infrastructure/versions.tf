terraform {
  # Cambiado de "~>1.12.2" a ">= 1.12.2" para permitir la versión 1.15.5 de tu Mac
  required_version = ">= 1.12.2"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~>5.93.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7.0"
    }
  }
}