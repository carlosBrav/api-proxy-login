output "id" {
  value = aws_vpc.main.id
}

output "cidr_block" {
  value = aws_vpc.main.cidr_block
}

output "sb_private_1_id" {
  value = aws_subnet.private_subnet_1.id
}

output "sb_private_2_id" {
  value = aws_subnet.private_subnet_2.id
}
