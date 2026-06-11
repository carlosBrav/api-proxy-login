
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = {
    Name = "vpc-${var.sufix}-principal"
  }
}

# Subnets privadas para Lambda y ElastiCache
resource "aws_subnet" "private_subnet_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${var.region}a"
}

resource "aws_subnet" "private_subnet_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "${var.region}b"
}

# VPC Endpoint para AWS Lambda
resource "aws_vpc_endpoint" "lambda" {
  # vpc_id              = var.vpc_id
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.lambda"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  # subnet_ids          = var.
  subnet_ids         = [aws_subnet.private_subnet_1.id, aws_subnet.private_subnet_2.id]
  security_group_ids = [var.sg_vpc_endpoint_id]
}