output "sg_vpc_endpoint_id" {
  value = aws_security_group.sg_vpc_endpoint.id
}

output "sg_redis_id" {
  value = aws_security_group.sg_redis.id
}

output "sg_lambda_id" {
  value = aws_security_group.sg_lambda.id
}