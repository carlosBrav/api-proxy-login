

############################
###### CREAR VPC ###########
############################

# module "vpc" {
#   source             = "./modules/vpc"
#   region             = var.tags.region
#   sg_vpc_endpoint_id = module.sg_redis_lambdas.sg_vpc_endpoint_id
#   vpc_id             = var.vpc_id
#   subnet_ids         = [var.subnet_private_1_id, var.subnet_private_2_id]
#   sufix              = local.sufix
# }

# ##########################################
# ####### CREAR SECURITY GROUPS ############
# ##########################################

module "sg_redis_lambdas" {
  source           = "./modules/security_group"
  sg_endpoint_name = "sgroup-${local.sufix}-endpoint"
  sg_lambda_name   = "sgroup-${local.sufix}-lambda"
  sg_redis_name    = "sgroup-${local.sufix}-redis"
  vpc_cidr_block   = "10.0.0.0/16"
  vpc_id           = var.vpc_id
  sb_private_1_id  = var.subnet_private_1_id
  sb_private_2_id  = var.subnet_private_2_id
}

########################################
####### CREAR ELASTIC CACHE REDIS ######
########################################

module "elastic_cache_redis" {
  source          = "./modules/elastic_cache"
  esg_name        = "esg-${local.sufix}-redis"
  ec_name         = "ec-${local.sufix}-redis"
  sb_private_1_id = var.subnet_private_1_id
  sb_private_2_id = var.subnet_private_2_id
  sg_redis_id     = module.sg_redis_lambdas.sg_redis_id
}

########################################
####### CREAR LAMBDA LAYERS ############
########################################

# Lambda Layer para redis (usado por Cognito triggers)
# Comentado temporalmente - pendiente implementación en pipeline
# module "layer_redis" {
#   source = "./modules/lambda/layer"
#   
#   layer_name          = "python-redis-layer-${local.sufix}"
#   source_dir          = "${path.root}/lambda_layers/redis"
#   output_path         = "${path.root}/lambda_layers/redis-layer.zip"
#   compatible_runtimes = ["python3.9", "python3.10", "python3.11", "python3.12"]
#   description         = "Layer con redis para Cognito triggers Python"
# }

#################################################
####### CREAR FUNCIONES LAMBDA COGNITO #########
#################################################

#Se crea la funcion define_auth_challenge
module "lambda_fn_define_auth_challenge" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[0]}"
  function_name   = local.lambdas_files_name[0]
  runtime         = "python3.12"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
}

#Se crea la funcion create_auth_challenge
module "lambda_fn_create_auth_challenge" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[1]}"
  function_name   = local.lambdas_files_name[1]
  runtime         = "python3.12"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
}

#Se crea la funcion verify_auth_challenge
module "lambda_fn_verify_auth_challenge" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[2]}"
  function_name   = local.lambdas_files_name[2]
  runtime         = "python3.12"
  role_lambda_arn = var.role_arn
  subnet_ids      = [var.subnet_private_1_id, var.subnet_private_2_id]
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  scg_redis_id    = [module.sg_redis_lambdas.sg_lambda_id]
  # layers          = [module.layer_redis.layer_arn]  # Comentado - pendiente pipeline
  environments = {
    CACHE_REDIS_URL  = module.elastic_cache_redis.node_address
    CACHE_REDIS_PORT = module.elastic_cache_redis.port
  }
}

#Se crea la funcion pre_token_generation
module "lambda_fn_pre_token_generation" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[3]}"
  function_name   = local.lambdas_files_name[3]
  runtime         = "python3.12"
  role_lambda_arn = var.role_arn
  subnet_ids      = [var.subnet_private_1_id, var.subnet_private_2_id]
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  scg_redis_id    = [module.sg_redis_lambdas.sg_lambda_id]
  # layers          = [module.layer_redis.layer_arn]  # Comentado - pendiente pipeline
  environments = {
    CACHE_REDIS_URL  = module.elastic_cache_redis.node_address
    CACHE_REDIS_PORT = module.elastic_cache_redis.port
  }
}

############################################################
####### CREAR FUNCIONES LAMBDA COMPARTIDOS CALIMACO #########
############################################################


#Se crea la funcion getall data 
module "lambda_fn_get_user_detail" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[4]}"
  function_name   = local.lambdas_files_name[4]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion update password
module "lambda_fn_update_password" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[7]}"
  function_name   = local.lambdas_files_name[7]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion forgot password
module "lambda_fn_forgot_password" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[8]}"
  function_name   = local.lambdas_files_name[8]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion log-out
module "lambda_fn_log_out" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[9]}"
  function_name   = local.lambdas_files_name[9]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion refresh token
module "lambda_fn_refresh_token" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[10]}"
  function_name   = local.lambdas_files_name[10]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    COGNITO_URL       = "https://cognito-idp.${var.region}.amazonaws.com"
    COGNITO_CLIENT_ID = module.cog_app_client_altenar.id
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

####################################
####### WARM START LAMBDAS #########
####################################

# # # Arranque en caliente
# module "lambda_fn_verify_auth_challenge_warm_start" {
#   source                  = "./modules/lambda/alias"
#   lambda_alias            = "lambdaalias-vac-warmstart"
#   lambda_function_name    = module.lambda_fn_verify_auth_challenge.function_name
#   lambda_function_version = module.lambda_fn_verify_auth_challenge.version
#   quantity_provisioned    = 3
# }

module "lambda_lambda_fn_define_auth_challenge_warm_start" {
  source                  = "./modules/lambda/alias"
  lambda_alias            = "lambdaalias-dac-warmstart"
  lambda_function_name    = module.lambda_fn_define_auth_challenge.function_name
  lambda_function_version = module.lambda_fn_define_auth_challenge.version
  quantity_provisioned    = 3
}

module "lambda_lambda_fn_create_auth_challenge_warm_start" {
  source                  = "./modules/lambda/alias"
  lambda_alias            = "lambdaalias-cac-warmstart"
  lambda_function_name    = module.lambda_fn_create_auth_challenge.function_name
  lambda_function_version = module.lambda_fn_create_auth_challenge.version
  quantity_provisioned    = 3
}

# module "lambda_lambda_fn_pre_token_generation_warm_start" {
#   source                  = "./modules/lambda/alias"
#   lambda_alias            = "lambdaalias-ptg-warmstart"
#   lambda_function_name    = module.lambda_fn_pre_token_generation.function_name
#   lambda_function_version = module.lambda_fn_pre_token_generation.version
#   quantity_provisioned    = 3
# }


module "lambda_lambda_fn_get_user_detail_warm_start" {
  source                  = "./modules/lambda/alias"
  lambda_alias            = "lambdaalias-gud-warmstart"
  lambda_function_name    = module.lambda_fn_get_user_detail.function_name
  lambda_function_version = module.lambda_fn_get_user_detail.version
  quantity_provisioned    = 3
}


########################################
####### CREAR COGNITO #########
########################################

#Se crea el user pool y el client y se le pasa los lambda personalizados
module "cog_custom_user_pool" {
  source = "./modules/cognito/user_pool"
  name   = "coguserpool-${local.sufix}-custom-auth"
  lambda_config = {
    define_auth_challenge_arn = module.lambda_fn_define_auth_challenge.arn
    create_auth_challenge_arn = module.lambda_fn_create_auth_challenge.arn
    verify_auth_challenge_arn = module.lambda_fn_verify_auth_challenge.arn
    pre_token_generation_arn  = module.lambda_fn_pre_token_generation.arn
  }
}

#Se asigna los permisos a cognito personalizado con los challenge 
module "user_pool_permissions" {
  source = "./modules/lambda/permission"
  for_each = {
    "AllowCognitoInvokeDefineAuth"         = module.lambda_fn_define_auth_challenge.function_name
    "AllowCognitoInvokeCreateAuth"         = module.lambda_fn_create_auth_challenge.function_name
    "AllowCognitoInvokeVerifyAuth"         = module.lambda_fn_verify_auth_challenge.function_name
    "AllowCognitoInvokePreTokenGeneration" = module.lambda_fn_pre_token_generation.function_name
  }
  lambda_fn_name = each.value
  statement_id   = each.key
  source_arn     = module.cog_custom_user_pool.arn
  action         = "lambda:InvokeFunction"
  principal      = "cognito-idp.${var.region}.amazonaws.com"

  depends_on = [module.cog_custom_user_pool]
}



####################################################
####### CONFIGURACION DE SERVICIOS ALTENAR #########
####################################################

module "cog_app_client_altenar" {
  source       = "./modules/cognito/user_pool_client"
  name         = "cogappclient-${local.sufix}-altenar"
  user_pool_id = module.cog_custom_user_pool.id
}

#Se crea la funcion SignIn 
module "lambda_fn_sign_in_altenar" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[5]}-altenar"
  function_name   = local.lambdas_files_name[5]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = 2048 # Increased from 1024 for better performance (more CPU)
  architectures   = local.lambda_config.architectures
  environments = {
    COGNITO_URL       = "https://cognito-idp.${var.region}.amazonaws.com"
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    USER_POOL_ID      = module.cog_custom_user_pool.id
    CALIMACO_BASE_URL = var.url_api_calimaco
    CLIENT_ID         = module.cog_app_client_altenar.id
    CLIENT_SECRET     = module.cog_app_client_altenar.secret
  }
}

#Se crea la funcion Crypto 
module "lambda_fn_crypto_altenar" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[6]}-altenar"
  function_name   = local.lambdas_files_name[6]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = false
  memory_size     = 512
  timeout         = 30
  architectures   = local.lambda_config.architectures
  environments = {
    # APP_CLIENTS = "APP_CLIENTS={\"app-altenar\": \"PruebaACity2025***\", \"app-poker\": \"PruebaACity2025***\"}"
    SECRET_KEY = "PruebaACity2025***"
  }
}

#Se crea la funcion claim code promotion
module "lambda_fn_claim_code_promotion" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[11]}"
  function_name   = local.lambdas_files_name[11]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get user accounts
module "lambda_fn_get_user_accounts" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[12]}"
  function_name   = local.lambdas_files_name[12]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion cancel user promotion
module "lambda_fn_cancel_user_promotion" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[13]}"
  function_name   = local.lambdas_files_name[13]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get user active promotions
module "lambda_fn_get_user_active_promotions" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[14]}"
  function_name   = local.lambdas_files_name[14]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get user pending promotions
module "lambda_fn_get_user_pending_promotions" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[15]}"
  function_name   = local.lambdas_files_name[15]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get user files
module "lambda_fn_get_user_files" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[16]}"
  function_name   = local.lambdas_files_name[16]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion auto exclude
module "lambda_fn_auto_exclude" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[17]}"
  function_name   = local.lambdas_files_name[17]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get auto exclutions
module "lambda_fn_get_auto_exclutions" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[18]}"
  function_name   = local.lambdas_files_name[18]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get user deposit limits
module "lambda_fn_get_user_deposit_limits" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[19]}"
  function_name   = local.lambdas_files_name[19]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

# #Se crea la funcion user payment accounts
module "lambda_fn_user_payment_accounts" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[20]}"
  function_name   = local.lambdas_files_name[20]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion validate session
module "lambda_fn_validate_session" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[21]}"
  function_name   = local.lambdas_files_name[21]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get users personal preferences
module "lambda_fn_get_users_personal_preferences" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[22]}"
  function_name   = local.lambdas_files_name[22]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get user personal preferences
module "lambda_fn_get_user_personal_preferences" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[23]}"
  function_name   = local.lambdas_files_name[23]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion active user promotion
module "lambda_fn_active_user_promotion" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[24]}"
  function_name   = local.lambdas_files_name[24]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get transactions history
module "lambda_fn_get_transactions_history" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[25]}"
  function_name   = local.lambdas_files_name[25]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get operations history
module "lambda_fn_get_operations_history" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[26]}"
  function_name   = local.lambdas_files_name[26]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion save user consent
module "lambda_fn_save_user_consent" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[27]}"
  function_name   = local.lambdas_files_name[27]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get web fragment
module "lambda_fn_get_web_fragment" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[28]}"
  function_name   = local.lambdas_files_name[28]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion save user consent
module "lambda_fn_get_banners" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[29]}"
  function_name   = local.lambdas_files_name[29]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_get_selectables_promotions" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[30]}"
  function_name   = local.lambdas_files_name[30]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_get_countries" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[31]}"
  function_name   = local.lambdas_files_name[31]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_get_machine_by_name" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[32]}"
  function_name   = local.lambdas_files_name[32]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_get_providers" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[33]}"
  function_name   = local.lambdas_files_name[33]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_get_deposit_lobby" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[34]}"
  function_name   = local.lambdas_files_name[34]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_get_states" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[35]}"
  function_name   = local.lambdas_files_name[35]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_get_provinces" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[36]}"
  function_name   = local.lambdas_files_name[36]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_get_cities" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[37]}"
  function_name   = local.lambdas_files_name[37]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_get_payout_lobby" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[38]}"
  function_name   = local.lambdas_files_name[38]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_validate_code_otp" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[39]}"
  function_name   = local.lambdas_files_name[39]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION           = var.region
    FN_CRYPTO        = module.lambda_fn_crypto_altenar.function_name
    EXTERNAL_API_URL = "https://api-registro.acity.com.pe/api/v3/GestorOtp/ValidarCodigo"
  }
}

module "lambda_fn_generate_code_otp" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[40]}"
  function_name   = local.lambdas_files_name[40]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION           = var.region
    FN_CRYPTO        = module.lambda_fn_crypto_altenar.function_name
    EXTERNAL_API_URL = "https://api-registro.acity.com.pe/api/v3/GestorOtp/GenerarCodigo"
  }
}

module "lambda_fn_national_id_available" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[41]}"
  function_name   = local.lambdas_files_name[41]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_email_available" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[42]}"
  function_name   = local.lambdas_files_name[42]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_mobile_available" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[43]}"
  function_name   = local.lambdas_files_name[43]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_alias_available" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[44]}"
  function_name   = local.lambdas_files_name[44]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_save_user_deposit_limits" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[45]}"
  function_name   = local.lambdas_files_name[45]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_save_personal_preferences" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[46]}"
  function_name   = local.lambdas_files_name[46]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_save_user_detail" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[47]}"
  function_name   = local.lambdas_files_name[47]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_add_user_payment_account" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[48]}"
  function_name   = local.lambdas_files_name[48]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_pending_payouts" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[49]}"
  function_name   = local.lambdas_files_name[49]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_cancel_payout" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[50]}"
  function_name   = local.lambdas_files_name[50]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_deposit" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[51]}"
  function_name   = local.lambdas_files_name[51]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_payout" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[52]}"
  function_name   = local.lambdas_files_name[52]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_get_provider_info" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[53]}"
  function_name   = local.lambdas_files_name[53]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion upload file
module "lambda_fn_upload_file" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[54]}"
  function_name   = local.lambdas_files_name[54]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

#Se crea la funcion get deposit info
module "lambda_fn_get_deposit_info" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[55]}"
  function_name   = local.lambdas_files_name[55]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}

module "lambda_fn_delete_user_payment_account" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[56]}"
  function_name   = local.lambdas_files_name[56]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}


module "lambda_fn_renew_refresh_session" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[57]}"
  function_name   = local.lambdas_files_name[57]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
    COGNITO_URL       = "https://cognito-idp.${var.region}.amazonaws.com"
    CLIENT_ID         = module.cog_app_client_altenar.id
    CLIENT_SECRET     = module.cog_app_client_altenar.secret
    USER_POOL_ID      = module.cog_custom_user_pool.id
  }
}


module "lambda_fn_refresh_session_revoke" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[58]}"
  function_name   = local.lambdas_files_name[58]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}


module "lambda_fn_refresh_session_obtain" {
  source          = "./modules/lambda/function"
  lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[59]}"
  function_name   = local.lambdas_files_name[59]
  runtime         = "nodejs18.x"
  role_lambda_arn = var.role_arn
  is_publish      = true
  timeout         = local.lambda_config.timeout
  memory_size     = local.lambda_config.memory_size
  architectures   = local.lambda_config.architectures
  environments = {
    REGION            = var.region
    FN_CRYPTO         = module.lambda_fn_crypto_altenar.function_name
    CALIMACO_BASE_URL = var.url_api_calimaco
  }
}


module "apigateway_api_rest_altenar" {
  source                  = "./modules/apigateway/rest_api"
  name                    = "apigateway-${local.sufix}-api-altenar"
  gateway_authorizer_name = "authgateway-${local.sufix}-authorizer"
  cognito_userpool_arn    = module.cog_custom_user_pool.arn
}


module "apigateway_integrations_renew_refresh_session" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "refresh"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_renew_refresh_session.invoke_arn
      lambda_fn_name    = module.lambda_fn_renew_refresh_session.function_name
    }
  ]
}


module "apigateway_integrations_refresh_revoke" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "revoke"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_refresh_session_revoke.invoke_arn
      lambda_fn_name    = module.lambda_fn_refresh_session_revoke.function_name
    }
  ]
}


module "apigateway_integrations_refresh_obtain" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "obtain-tokens"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_refresh_session_obtain.invoke_arn
      lambda_fn_name    = module.lambda_fn_refresh_session_obtain.function_name
    }
  ]
}


module "apigateway_integrations_get_user_detail_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = module.apigateway_api_rest_altenar.root_resource_id
  path_resource         = "get-user-detail"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_user_detail.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_user_detail.function_name
    }
  ]
}


module "apigateway_integrations_sign_in_altenar" {
  source               = "./modules/apigateway/integration"
  environment          = var.tags.environment
  api_id               = module.apigateway_api_rest_altenar.id
  api_execution_arn    = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id = module.apigateway_api_rest_altenar.root_resource_id
  path_resource        = "login"
  enable_cors          = true
  methods = [
    {
      http_method       = "POST"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_sign_in_altenar.invoke_arn
      lambda_fn_name    = module.lambda_fn_sign_in_altenar.function_name
    }
  ]
}


module "apigateway_integrations_update_password_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = module.apigateway_api_rest_altenar.root_resource_id
  path_resource         = "update-password"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "PATCH"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_update_password.invoke_arn
      lambda_fn_name    = module.lambda_fn_update_password.function_name
    }
  ]
}


module "apigateway_integrations_forgot_password_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = module.apigateway_api_rest_altenar.root_resource_id
  path_resource         = "forgot-password"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_forgot_password.invoke_arn
      lambda_fn_name    = module.lambda_fn_forgot_password.function_name
    }
  ]
}


module "apigateway_integrations_log_out_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = module.apigateway_api_rest_altenar.root_resource_id
  path_resource         = "sign-out"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_log_out.invoke_arn
      lambda_fn_name    = module.lambda_fn_log_out.function_name
    }
  ]
}


module "apigateway_integrations_refresh_token_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = module.apigateway_api_rest_altenar.root_resource_id
  path_resource         = "refresh-token"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_refresh_token.invoke_arn
      lambda_fn_name    = module.lambda_fn_refresh_token.function_name
    }
  ]
}


# ======================
# Base path /casino
# ======================
resource "aws_api_gateway_resource" "casino" {
  rest_api_id = module.apigateway_api_rest_altenar.id
  parent_id   = module.apigateway_api_rest_altenar.root_resource_id
  path_part   = "casino"
}

module "apigateway_integrations_get_provider_info_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.casino.id
  path_resource         = "provider-info"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_provider_info.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_provider_info.function_name
    }
  ]
}


# ======================
# Base path /data
# ======================
resource "aws_api_gateway_resource" "data" {
  rest_api_id = module.apigateway_api_rest_altenar.id
  parent_id   = module.apigateway_api_rest_altenar.root_resource_id
  path_part   = "data"
}

module "apigateway_integrations_add_user_payment_account_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "user-payment-accounts"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_add_user_payment_account.invoke_arn
      lambda_fn_name    = module.lambda_fn_add_user_payment_account.function_name
    },
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_user_payment_accounts.invoke_arn,
      lambda_fn_name    = module.lambda_fn_user_payment_accounts.function_name
    }
  ]
}

module "apigateway_integrations_validate_session_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "validate-session"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_validate_session.invoke_arn
      lambda_fn_name    = module.lambda_fn_validate_session.function_name

    }
  ]
}


module "apigateway_integrations_get_users_personal_preferences_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "users-personal-preferences"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_get_users_personal_preferences.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_users_personal_preferences.function_name
    }
  ]
}


module "apigateway_integrations_get_user_personal_preferences_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "user-personal-preferences"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_user_personal_preferences.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_user_personal_preferences.function_name
    },
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_save_personal_preferences.invoke_arn
      lambda_fn_name    = module.lambda_fn_save_personal_preferences.function_name
    }
  ]
}


module "apigateway_integrations_active_user_promotion_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "active-user-promotion"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_active_user_promotion.invoke_arn
      lambda_fn_name    = module.lambda_fn_active_user_promotion.function_name
    }
  ]
}


module "apigateway_integrations_get_transactions_history_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "transactions-history"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_transactions_history.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_transactions_history.function_name
    }
  ]
}


module "apigateway_integrations_get_operations_history_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "operations-history"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_operations_history.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_operations_history.function_name
    }
  ]
}


module "apigateway_integrations_save_user_consent_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "save-user-consent"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_save_user_consent.invoke_arn
      lambda_fn_name    = module.lambda_fn_save_user_consent.function_name
    }
  ]
}


module "apigateway_integrations_save_user_deposit_limits_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "user-deposit-limits"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_save_user_deposit_limits.invoke_arn
      lambda_fn_name    = module.lambda_fn_save_user_deposit_limits.function_name
    },
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_user_deposit_limits.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_user_deposit_limits.function_name
    },
  ]
}


module "apigateway_integrations_save_user_detail_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "user-detail"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_save_user_detail.invoke_arn
      lambda_fn_name    = module.lambda_fn_save_user_detail.function_name
    }
  ]
}


module "apigateway_integrations_pending_payouts_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "pending-payouts"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_pending_payouts.invoke_arn
      lambda_fn_name    = module.lambda_fn_pending_payouts.function_name
    }
  ]
}


module "apigateway_integrations_cancel_payout_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "cancel-payout"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_cancel_payout.invoke_arn
      lambda_fn_name    = module.lambda_fn_cancel_payout.function_name
    }
  ]
}

module "apigateway_integrations_claim_code_promotion_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "claim-code-promotion"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_claim_code_promotion.invoke_arn
      lambda_fn_name    = module.lambda_fn_claim_code_promotion.function_name
    }
  ]
}


module "apigateway_integrations_get_user_accounts_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "user-accounts"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_user_accounts.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_user_accounts.function_name

    }
  ]
}

module "apigateway_integrations_get_user_active_promotions_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "user-active-promotions"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_user_active_promotions.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_user_active_promotions.function_name

    }
  ]
}

module "apigateway_integrations_cancel_user_promotion_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "cancel-user-promotion"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_cancel_user_promotion.invoke_arn
      lambda_fn_name    = module.lambda_fn_cancel_user_promotion.function_name

    }
  ]
}

module "apigateway_integrations_get_user_pending_promotions_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "user-pending-promotions"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_user_pending_promotions.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_user_pending_promotions.function_name

    }
  ]
}

module "apigateway_integrations_get_user_files_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "user-files"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_user_files.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_user_files.function_name

    }
  ]
}

module "apigateway_integrations_upload_file_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "upload-file"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_upload_file.invoke_arn
      lambda_fn_name    = module.lambda_fn_upload_file.function_name
    }
  ]
}

module "apigateway_integrations_auto_exclude_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "auto-exclude"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_auto_exclude.invoke_arn
      lambda_fn_name    = module.lambda_fn_auto_exclude.function_name

    },
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_auto_exclutions.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_auto_exclutions.function_name

    }
  ]
}

module "apigateway_integrations_delete_user_payment_account" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.data.id
  path_resource         = "delete-user-payment-account"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_delete_user_payment_account.invoke_arn
      lambda_fn_name    = module.lambda_fn_delete_user_payment_account.function_name
    }
  ]
}


# ======================
# Base path /contents
# ======================
resource "aws_api_gateway_resource" "contents" {
  rest_api_id = module.apigateway_api_rest_altenar.id
  parent_id   = module.apigateway_api_rest_altenar.root_resource_id
  path_part   = "contents"
}

module "apigateway_integrations_get_web_fragment_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.contents.id
  path_resource         = "get-web-fragment"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_get_web_fragment.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_web_fragment.function_name
    }
  ]
}


module "apigateway_integrations_get_banners_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.contents.id
  path_resource         = "banners"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_get_banners.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_banners.function_name
    }
  ]
}


module "apigateway_integrations_get_selectables_promotions" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.contents.id
  path_resource         = "selectables-promotions"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_get_selectables_promotions.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_selectables_promotions.function_name
    }
  ]
}


module "apigateway_integrations_get_countries" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.contents.id
  path_resource         = "countries"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_get_countries.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_countries.function_name
    }
  ]
}


module "apigateway_integrations_get_machine_by_name" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.contents.id
  path_resource         = "machine-by-name"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_machine_by_name.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_machine_by_name.function_name
    }
  ]
}


module "apigateway_integrations_get_providers" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.contents.id
  path_resource         = "providers"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_get_providers.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_providers.function_name
    }
  ]
}


module "apigateway_integrations_get_deposit_lobby" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.contents.id
  path_resource         = "get-deposit-lobby"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_deposit_lobby.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_deposit_lobby.function_name
    }
  ]
}


module "apigateway_integrations_get_states" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.contents.id
  path_resource         = "states"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_get_states.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_states.function_name
    }
  ]
}


module "apigateway_integrations_get_provinces" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.contents.id
  path_resource         = "provinces"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_get_provinces.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_provinces.function_name
    }
  ]
}


module "apigateway_integrations_get_cities" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.contents.id
  path_resource         = "cities"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "NONE"
      lambda_invoke_arn = module.lambda_fn_get_cities.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_cities.function_name
    }
  ]
}


module "apigateway_integrations_get_payout_lobby" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.contents.id
  path_resource         = "payout-lobby"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_payout_lobby.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_payout_lobby.function_name
    }
  ]
}


# ======================
# Base path /gestor-otp
# ======================
resource "aws_api_gateway_resource" "gestor_otp" {
  rest_api_id = module.apigateway_api_rest_altenar.id
  parent_id   = module.apigateway_api_rest_altenar.root_resource_id
  path_part   = "gestor-otp"
}

module "apigateway_integrations_validate_code_otp" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.gestor_otp.id
  path_resource         = "validate-code"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_validate_code_otp.invoke_arn
      lambda_fn_name    = module.lambda_fn_validate_code_otp.function_name
    }
  ]
}


module "apigateway_integrations_generate_code_otp" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.gestor_otp.id
  path_resource         = "generate-code"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_generate_code_otp.invoke_arn
      lambda_fn_name    = module.lambda_fn_generate_code_otp.function_name
    }
  ]
}


# # ======================
# # Base path /auth
# # ======================
resource "aws_api_gateway_resource" "auth" {
  rest_api_id = module.apigateway_api_rest_altenar.id
  parent_id   = module.apigateway_api_rest_altenar.root_resource_id
  path_part   = "auth"
}

module "apigateway_integrations_national_id_available" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.auth.id
  path_resource         = "national-id-available"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "NONE"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_national_id_available.invoke_arn
      lambda_fn_name    = module.lambda_fn_national_id_available.function_name
    }
  ]
}

module "apigateway_integrations_email_available" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.auth.id
  path_resource         = "email-available"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "NONE"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_email_available.invoke_arn
      lambda_fn_name    = module.lambda_fn_email_available.function_name
    }
  ]
}

module "apigateway_integrations_mobile_available" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.auth.id
  path_resource         = "mobile-available"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "NONE"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_mobile_available.invoke_arn
      lambda_fn_name    = module.lambda_fn_mobile_available.function_name
    }
  ]
}

module "apigateway_integrations_alias_available" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.auth.id
  path_resource         = "alias-available"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "NONE"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_alias_available.invoke_arn
      lambda_fn_name    = module.lambda_fn_alias_available.function_name
    }
  ]
}


# ======================
# Base path /payment
# ======================
resource "aws_api_gateway_resource" "payment" {
  rest_api_id = module.apigateway_api_rest_altenar.id
  parent_id   = module.apigateway_api_rest_altenar.root_resource_id
  path_part   = "payment"
}

module "apigateway_integrations_deposit_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.payment.id
  path_resource         = "deposit"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_deposit.invoke_arn
      lambda_fn_name    = module.lambda_fn_deposit.function_name
    }
  ]
}

module "apigateway_integrations_payout_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.payment.id
  path_resource         = "payout"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "POST"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_payout.invoke_arn
      lambda_fn_name    = module.lambda_fn_payout.function_name
    }
  ]
}

module "apigateway_integrations_deposit_info_altenar" {
  source                = "./modules/apigateway/integration"
  environment           = var.tags.environment
  api_id                = module.apigateway_api_rest_altenar.id
  api_execution_arn     = module.apigateway_api_rest_altenar.execution_arn
  api_root_resource_id  = aws_api_gateway_resource.payment.id
  path_resource         = "deposit-info"
  enable_cors           = true
  client_name           = "altenar"
  has_client_name_in_fn = false
  methods = [
    {
      http_method       = "GET"
      authorization     = "COGNITO_USER_POOLS"
      authorizer_id     = module.apigateway_api_rest_altenar.authorizer_id
      lambda_invoke_arn = module.lambda_fn_get_deposit_info.invoke_arn
      lambda_fn_name    = module.lambda_fn_get_deposit_info.function_name
    }
  ]
}


module "apigateway_deployment_altenar" {
  depends_on = [
    module.apigateway_integrations_get_user_detail_altenar,
    module.apigateway_integrations_sign_in_altenar,
    module.apigateway_integrations_update_password_altenar,
    module.apigateway_integrations_forgot_password_altenar,
    module.apigateway_integrations_log_out_altenar,
    module.apigateway_integrations_refresh_token_altenar,
    module.apigateway_integrations_claim_code_promotion_altenar,
    module.apigateway_integrations_get_user_accounts_altenar,
    module.apigateway_integrations_cancel_user_promotion_altenar,
    module.apigateway_integrations_get_user_active_promotions_altenar,
    module.apigateway_integrations_get_user_pending_promotions_altenar,
    module.apigateway_integrations_get_user_files_altenar,
    module.apigateway_integrations_upload_file_altenar,
    module.apigateway_integrations_auto_exclude_altenar,
    module.apigateway_integrations_validate_session_altenar,
    module.apigateway_integrations_get_users_personal_preferences_altenar,
    module.apigateway_integrations_get_user_personal_preferences_altenar,
    module.apigateway_integrations_active_user_promotion_altenar,
    module.apigateway_integrations_get_transactions_history_altenar,
    module.apigateway_integrations_get_operations_history_altenar,
    module.apigateway_integrations_save_user_consent_altenar,
    module.apigateway_integrations_get_web_fragment_altenar,
    module.apigateway_integrations_get_banners_altenar,
    module.apigateway_integrations_get_selectables_promotions,
    module.apigateway_integrations_get_countries,
    module.apigateway_integrations_get_machine_by_name,
    module.apigateway_integrations_get_providers,
    module.apigateway_integrations_get_deposit_lobby,
    module.apigateway_integrations_get_states,
    module.apigateway_integrations_get_provinces,
    module.apigateway_integrations_get_cities,
    module.apigateway_integrations_get_payout_lobby,
    module.apigateway_integrations_validate_code_otp,
    module.apigateway_integrations_generate_code_otp,
    module.apigateway_integrations_national_id_available,
    module.apigateway_integrations_email_available,
    module.apigateway_integrations_mobile_available,
    module.apigateway_integrations_alias_available,
    module.apigateway_integrations_save_user_deposit_limits_altenar,
    module.apigateway_integrations_add_user_payment_account_altenar,
    module.apigateway_integrations_pending_payouts_altenar,
    module.apigateway_integrations_cancel_payout_altenar,
    module.apigateway_integrations_get_provider_info_altenar,
    module.apigateway_integrations_deposit_altenar,
    module.apigateway_integrations_payout_altenar,
    module.apigateway_integrations_save_user_detail_altenar,
    module.apigateway_integrations_deposit_info_altenar,
    module.apigateway_integrations_delete_user_payment_account,
    module.apigateway_integrations_renew_refresh_session,
    module.apigateway_integrations_refresh_revoke,
    module.apigateway_integrations_refresh_obtain,
  ]
  source      = "./modules/apigateway/deployment"
  api_id      = module.apigateway_api_rest_altenar.id
  environment = var.tags.environment
  redeployment_resources = concat(
    module.apigateway_integrations_get_user_detail_altenar.redeploy_fingerprint,
    module.apigateway_integrations_sign_in_altenar.redeploy_fingerprint,
    module.apigateway_integrations_update_password_altenar.redeploy_fingerprint,
    module.apigateway_integrations_forgot_password_altenar.redeploy_fingerprint,
    module.apigateway_integrations_log_out_altenar.redeploy_fingerprint,
    module.apigateway_integrations_refresh_token_altenar.redeploy_fingerprint,
    module.apigateway_integrations_claim_code_promotion_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_user_accounts_altenar.redeploy_fingerprint,
    module.apigateway_integrations_cancel_user_promotion_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_user_active_promotions_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_user_pending_promotions_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_user_files_altenar.redeploy_fingerprint,
    module.apigateway_integrations_upload_file_altenar.redeploy_fingerprint,
    module.apigateway_integrations_auto_exclude_altenar.redeploy_fingerprint,
    module.apigateway_integrations_validate_session_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_users_personal_preferences_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_user_personal_preferences_altenar.redeploy_fingerprint,
    module.apigateway_integrations_active_user_promotion_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_transactions_history_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_operations_history_altenar.redeploy_fingerprint,
    module.apigateway_integrations_save_user_consent_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_web_fragment_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_banners_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_selectables_promotions.redeploy_fingerprint,
    module.apigateway_integrations_get_countries.redeploy_fingerprint,
    module.apigateway_integrations_get_machine_by_name.redeploy_fingerprint,
    module.apigateway_integrations_get_providers.redeploy_fingerprint,
    module.apigateway_integrations_get_deposit_lobby.redeploy_fingerprint,
    module.apigateway_integrations_get_states.redeploy_fingerprint,
    module.apigateway_integrations_get_provinces.redeploy_fingerprint,
    module.apigateway_integrations_get_cities.redeploy_fingerprint,
    module.apigateway_integrations_get_payout_lobby.redeploy_fingerprint,
    module.apigateway_integrations_validate_code_otp.redeploy_fingerprint,
    module.apigateway_integrations_generate_code_otp.redeploy_fingerprint,
    module.apigateway_integrations_national_id_available.redeploy_fingerprint,
    module.apigateway_integrations_email_available.redeploy_fingerprint,
    module.apigateway_integrations_mobile_available.redeploy_fingerprint,
    module.apigateway_integrations_alias_available.redeploy_fingerprint,
    module.apigateway_integrations_save_user_deposit_limits_altenar.redeploy_fingerprint,
    module.apigateway_integrations_add_user_payment_account_altenar.redeploy_fingerprint,
    module.apigateway_integrations_pending_payouts_altenar.redeploy_fingerprint,
    module.apigateway_integrations_cancel_payout_altenar.redeploy_fingerprint,
    module.apigateway_integrations_get_provider_info_altenar.redeploy_fingerprint,
    module.apigateway_integrations_deposit_altenar.redeploy_fingerprint,
    module.apigateway_integrations_payout_altenar.redeploy_fingerprint,
    module.apigateway_integrations_save_user_detail_altenar.redeploy_fingerprint,
    module.apigateway_integrations_deposit_info_altenar.redeploy_fingerprint,
    module.apigateway_integrations_delete_user_payment_account.redeploy_fingerprint,
    module.apigateway_integrations_renew_refresh_session.redeploy_fingerprint,
    module.apigateway_integrations_refresh_revoke.redeploy_fingerprint,
    module.apigateway_integrations_refresh_obtain.redeploy_fingerprint,
  )
}

####################################################
####### CONFIGURACION DE SERVICIOS PLAYTECH #########
####################################################


# module "cog_app_client_playtech" {
#   source       = "./modules/cognito/user_pool_client"
#   name         = "cogappclient-${local.sufix}-playtech"
#   user_pool_id = module.cog_custom_user_pool.id
# }

# #Se crea la funcion SignIn 
# module "lambda_fn_sign_in_playtech" {
#   source          = "./modules/lambda/function"
#   lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[5]}-playtech"
#   function_name   = local.lambdas_files_name[5]
#   runtime         = "python3.12"
#   role_lambda_arn = var.role_arn
#   is_publish      = true
#   timeout         = local.lambda_config.timeout
#   memory_size     = local.lambda_config.memory_size
#   architectures   = local.lambda_config.architectures
#   environments = {
#     COGNITO_URL  = "https://cognito-idp.${var.region}.amazonaws.com"
#     FN_CRYPTO    = module.lambda_fn_crypto_playtech.function_name
#     USER_POOL_ID = module.cog_custom_user_pool.id

#     CLIENT_ID     = module.cog_app_client_playtech.id
#     CLIENT_SECRET = module.cog_app_client_playtech.secret
#   }
# }

# #Se crea la funcion Crypto 
# module "lambda_fn_crypto_playtech" {
#   source          = "./modules/lambda/function"
#   lambda_name     = "lambda-${local.sufix}-${local.lambdas_files_name[6]}-playtech"
#   function_name   = local.lambdas_files_name[6]
#   runtime         = "nodejs18.x"
#   role_lambda_arn = var.role_arn
#   is_publish      = false
#   memory_size     = 512
#   timeout         = 30
#   architectures   = local.lambda_config.architectures
#   environments = {
#     CRYPTO_SECRET_KEY = "PruebaACity2025$++"
#   }
# }

# module "apigateway_api_rest_playtech" {
#   source                  = "./modules/apigateway/rest_api"
#   name                    = "apigateway-${local.sufix}-api-playtech"
#   gateway_authorizer_name = "authgateway-${local.sufix}-authorizer"
#   cognito_userpool_arn    = module.cog_custom_user_pool.arn
# }

# module "apigateway_integrations_get_user_detail_playtech" {
#   source                = "./modules/apigateway/integration"
#   environment           = var.tags.environment
#   api_id                = module.apigateway_api_rest_playtech.id
#   api_execution_arn     = module.apigateway_api_rest_playtech.execution_arn
#   api_root_resource_id  = module.apigateway_api_rest_playtech.root_resource_id
#   authorizer_id         = module.apigateway_api_rest_playtech.authorizer_id
#   lambda_fn_name        = module.lambda_fn_get_user_detail.function_name
#   lambda_fn_invoke_arn  = module.lambda_fn_get_user_detail.invoke_arn
#   method                = "GET"
#   path_resource         = "get-user-detail"
#   authorization         = "COGNITO_USER_POOLS"
#   enable_cors           = true
#   client_name           = "playtech"
#   has_client_name_in_fn = false
# }

# module "apigateway_integrations_sign_in_playtech" {
#   source               = "./modules/apigateway/integration"
#   environment          = var.tags.environment
#   api_id               = module.apigateway_api_rest_playtech.id
#   api_execution_arn    = module.apigateway_api_rest_playtech.execution_arn
#   api_root_resource_id = module.apigateway_api_rest_playtech.root_resource_id
#   lambda_fn_name       = module.lambda_fn_sign_in_playtech.function_name
#   lambda_fn_invoke_arn = module.lambda_fn_sign_in_playtech.invoke_arn
#   authorizer_id        = module.apigateway_api_rest_playtech.authorizer_id
#   method               = "POST"
#   path_resource        = "sign-in"
#   authorization        = "NONE"
#   enable_cors          = true
# }

# module "apigateway_deployment_playtech" {
#   depends_on = [
#     module.apigateway_integrations_get_user_detail_playtech,
#     module.apigateway_integrations_sign_in_playtech,
#   ]
#   source      = "./modules/apigateway/deployment"
#   api_id      = module.apigateway_api_rest_playtech.id
#   environment = var.tags.environment
#   redeployment_resources = [
#     module.apigateway_integrations_get_user_detail_playtech.integration_id,
#     module.apigateway_integrations_get_user_detail_playtech.method_id,
#     module.apigateway_integrations_get_user_detail_playtech.resource_id,

#     module.apigateway_integrations_sign_in_playtech.integration_id,
#     module.apigateway_integrations_sign_in_playtech.method_id,
#     module.apigateway_integrations_sign_in_playtech.resource_id,
#   ]
# }

# module "api_waf_playtech" {
#   source            = "./modules/waf"
#   waf_name          = "waf-${local.sufix}-security-playtech"
#   api_execution_arn = "arn:aws:apigateway:${var.region}::/restapis/${module.apigateway_api_rest_playtech.id}/stages/${module.apigateway_deployment_playtech.stage_name}"
#   client_name       = "playtech"
# }

########################################
####### CREAR SERVICIO CLOUDWATCH ######
########################################

module "cloudwatch_loggings" {
  for_each = toset([
    # module.lambda_fn_generate_code_otp.function_name,
    # module.lambda_fn_get_banners.function_name,
    # module.lambda_fn_get_cities.function_name,
    # module.lambda_fn_get_countries.function_name,
    # module.lambda_fn_get_selectables_promotions.function_name,
    # module.lambda_fn_get_user_detail.function_name,
    # module.lambda_fn_national_id_available.function_name,
    module.lambda_fn_active_user_promotion.function_name,
    module.lambda_fn_add_user_payment_account.function_name,
    module.lambda_fn_alias_available.function_name,
    module.lambda_fn_auto_exclude.function_name,
    module.lambda_fn_cancel_payout.function_name,
    module.lambda_fn_cancel_user_promotion.function_name,
    module.lambda_fn_claim_code_promotion.function_name,
    module.lambda_fn_crypto_altenar.function_name,
    module.lambda_fn_deposit.function_name,
    module.lambda_fn_email_available.function_name,
    module.lambda_fn_forgot_password.function_name,
    module.lambda_fn_get_auto_exclutions.function_name,
    module.lambda_fn_get_deposit_lobby.function_name,
    module.lambda_fn_get_machine_by_name.function_name,
    module.lambda_fn_get_operations_history.function_name,
    module.lambda_fn_get_payout_lobby.function_name,
    module.lambda_fn_get_provider_info.function_name,
    module.lambda_fn_get_providers.function_name,
    module.lambda_fn_get_provinces.function_name,
    module.lambda_fn_get_states.function_name,
    module.lambda_fn_get_transactions_history.function_name,
    module.lambda_fn_get_user_accounts.function_name,
    module.lambda_fn_get_user_active_promotions.function_name,
    module.lambda_fn_get_user_deposit_limits.function_name,
    module.lambda_fn_get_user_files.function_name,
    module.lambda_fn_get_user_pending_promotions.function_name,
    module.lambda_fn_get_user_personal_preferences.function_name,
    module.lambda_fn_get_users_personal_preferences.function_name,
    module.lambda_fn_get_web_fragment.function_name,
    module.lambda_fn_log_out.function_name,
    module.lambda_fn_mobile_available.function_name,
    module.lambda_fn_payout.function_name,
    module.lambda_fn_pending_payouts.function_name,
    module.lambda_fn_refresh_token.function_name,
    module.lambda_fn_save_personal_preferences.function_name,
    module.lambda_fn_save_user_consent.function_name,
    module.lambda_fn_save_user_deposit_limits.function_name,
    # module.lambda_fn_save_user_detail.function_name,
    module.lambda_fn_sign_in_altenar.function_name,
    module.lambda_fn_update_password.function_name,
    module.lambda_fn_user_payment_accounts.function_name,
    module.lambda_fn_validate_code_otp.function_name,
    module.lambda_fn_validate_session.function_name,
    module.lambda_fn_upload_file.function_name,
    module.lambda_fn_get_deposit_info.function_name,
    module.lambda_fn_delete_user_payment_account.function_name,
    module.lambda_fn_renew_refresh_session.function_name,
    module.lambda_fn_refresh_session_revoke.function_name,
    module.lambda_fn_refresh_session_obtain.function_name
  ])
  source         = "./modules/cloudwatch"
  name           = "/aws/lambda/${each.value}"
  retention_days = 30
}

