# 🌍 Proyecto Terraform: Securizacion Sanitizacion de APIS COL

> Infraestructura como Código (IaC) gestionada con Terraform para aprovicionar un capa de seguridad y tokenizar las apis de casino online
> mediante el uso de cognito personalizado.

---

## ⚙️ Instalaciones Previas

```bash
npm install
npx husky install
```

---

## 📁 Estructura del Proyecto

```
└── 📁infrastructure
    └── 📁modules
        └── 📁apigateway
            └── 📁deployment
                └── main.tf
                └── outputs.tf
                └── variables.tf
            └── 📁integration
                └── main.tf
                └── outputs.tf
                └── variables.tf
            └── 📁rest_api
                └── main.tf
                └── outputs.tf
                └── variables.tf
        └── 📁cloudwatch
            └── main.tf
            └── variables.tf
        └── 📁cognito
            └── main.tf
            └── outputs.tf
            └── variables.tf
        └── 📁elastic_cache
            └── main.tf
            └── outputs.tf
            └── variables.tf
        └── 📁iam
            └── 📁policy
                └── main.tf
                └── outputs.tf
                └── variables.tf
            └── 📁role
                └── main.tf
                └── outputs.tf
                └── variables.tf
            └── 📁role_policy_attach
                └── main.tf
                └── variables.tf
                └── main.tf
                └── outputs.tf
                └── variables.tf
        └── 📁lambda
            └── 📁function
                └── main.tf
                └── outputs.tf
                └── variables.tf
            └── 📁permission
                └── main.tf
                └── outputs.tf
                └── variables.tf
        └── 📁security_group
            └── main.tf
            └── outputs.tf
            └── variables.tf
        └── 📁vpc
            └── main.tf
            └── outputs.tf
            └── variables.tf
        └── 📁waf
            └── main.tf
            └── variables.tf
    └── backend.tf
    └── data.tf
    └── locals.tf
    └── main.tf
    └── outputs.tf
    └── providers.tf
    └── terraform.tfvars.example
    └── variables.tf
    └── versions.tf
```

---

## 📄 Documentos

- [Arquitectura](https://drive.google.com/file/d/1ezl3P5MadRUy9-T88h4sXM2kzCGJO3_i/view?usp=drive_link) Hoja v2

---

## 🚀 Requisitos

- [Terraform](https://www.terraform.io/downloads.html) ~>1.11.0
- [Provider Cloud] (AWS)
- Acceso al backend remoto (S3)
- Credenciales configuradas localmente (`aws configure profile`, variables de entorno .tfvars)

---

## 🔧 Uso

### 1. Inicializar Terraform

```bash
terraform init
```

### 2. Validar la configuración

```bash
terraform validate
```

### 3. Previsualizar cambios

```bash
terraform plan
```

### 4. Aplicar cambios

```bash
terraform apply
```

> ⚠️ Recuerda revisar siempre el plan antes de aplicar cambios.

---

## 🛠 Variables

> Para más detalles ver el archivo `variables.tf`.

---

## 🔐 Backend Remoto (opcional)

```hcl
terraform {
  backend "s3" {}
}
```

> ⚠️ Dejar limpio el backend remoto cuadno se requiera usar ci-cd, se sobreescribe la configuración.

---

## Cambiar region y perfil (profiles)

```hcl
backend.tf
terraform.tfvars
```

## 🧪 Pruebas (opcional)

Si usas `terratest` o `checkov`, puedes incluir tests automáticos:

```bash
go test -v test/
checkov -d .
```

---

## 📚 Recursos

- [Terraform Docs](https://registry.terraform.io/)
- [Guía de Estilo HashiCorp](https://developer.hashicorp.com/terraform/language/syntax/style)
- [Documentación del Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
