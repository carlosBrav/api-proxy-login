# Grupo de subredes para ElastiCache
resource "aws_elasticache_subnet_group" "redis_subnet_group" {
  name       = var.esg_name
  subnet_ids = [var.sb_private_1_id, var.sb_private_2_id]
}

# Clúster de ElastiCache Redis
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = var.ec_name
  engine               = "redis"
  node_type            = "cache.t3.micro" # Ajusta según necesidades
  num_cache_nodes      = 1
  parameter_group_name = "default.redis6.x"
  engine_version       = "6.x"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis_subnet_group.name
  security_group_ids   = [var.sg_redis_id]
}