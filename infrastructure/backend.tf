terraform {
  # Comentamos todo el bloque para obligar a Terraform a usar el almacenamiento local por defecto
  # backend "s3" {
  #   # bucket       = "s3-infraestructura-iac-col"
  #   # key          = "state/col-securizacion-tokenizacion.tfstate"
  #   # encrypt      = true
  #   # region       = "us-west-2"
  #   # use_lockfile = true
  #   # profile      = "acity" 
  # }
}