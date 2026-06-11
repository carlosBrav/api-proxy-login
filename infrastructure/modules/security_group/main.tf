
#Grupo de seguridad para los VPC Endpoints
resource "aws_security_group" "sg_vpc_endpoint" {
  name   = var.sg_endpoint_name
  vpc_id = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr_block]
  }
}

# # Tabla de rutas privada
# resource "aws_route_table" "private_rt" {
#   vpc_id = var.vpc_id
# }

# # Asociaciones de la tabla de rutas privada
# resource "aws_route_table_association" "private_rta_1" {
#   subnet_id      = var.sb_private_1_id
#   route_table_id = aws_route_table.private_rt.id
# }

# resource "aws_route_table_association" "private_rta_2" {
#   subnet_id      = var.sb_private_2_id
#   route_table_id = aws_route_table.private_rt.id
# }

# Grupo de seguridad para ElastiCache Redis
resource "aws_security_group" "sg_redis" {
  name   = var.sg_redis_name
  vpc_id = var.vpc_id
}

# Grupo de seguridad para Lambda
resource "aws_security_group" "sg_lambda" {
  name   = var.sg_lambda_name
  vpc_id = var.vpc_id

  egress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.sg_vpc_endpoint.id]
  }

  egress {
    to_port         = 6379
    from_port       = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.sg_redis.id]
  }

}

# Reglas de seguridad adicionales usando aws_security_group_rule para evitar dependencias cíclicas
resource "aws_security_group_rule" "redis_ingress" {
  type                     = "ingress"
  from_port                = 6379
  to_port                  = 6379
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.sg_lambda.id
  security_group_id        = aws_security_group.sg_redis.id
}

# resource "aws_security_group_rule" "lambda_egress_to_redis" {
#   type                     = "egress"
#   from_port                = 6379
#   to_port                  = 6379
#   protocol                 = "tcp"
#   source_security_group_id = aws_security_group.sg_redis.id
#   security_group_id        = aws_security_group.sg_lambda.id
# }
