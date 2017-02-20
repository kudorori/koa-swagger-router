var parser = require('swagger-parser');
var koa = require("koa");
var Router = require("koa-router");
var _ = require("lodash");
var Ajv = require("ajv");

/*
var _controller = {};
var _middleware = {};
*/
var _swagger=null;

var r = new Router();

var lib = {
	parserAPI:function(path){
		return parser.validate(path,{
			$refs: {
			    internal: true   // Don't dereference internal $refs, only external
			}
		})
	},
	initRouter:function(_controller,_middleware){
		r.prefix(_swagger.basePath);
		
		_.toPairs(_swagger.paths).forEach(([path,methods])=>{
			try{
				var toPath = path.replace(/(\{(\w*)\})/g, ":$2");
				var processList = [toPath];
				if(methods["x-router"]==undefined){
					throw "x-router not found";
				}
				processList = processList.concat(lib.bindMiddleware(methods["x-router"]["middleware"],_middleware));
				_.toPairs(methods).forEach(([method,detail])=>{
					if(["get","post","patch","delete","put"].indexOf(method)=="-1"){
						return;
					}
				
					var controller = _controller[methods["x-router"]["controller"]];
					if(controller==undefined){
						throw "controller not found";
					}
					var action = controller[methods["x-router"]["action"]];
					
					if(action==undefined){
						throw "action not found";
					}
					
					if(action[method]==undefined){
						throw "action method not found";
					}
					
					var subProcessList = [lib.bindParams(detail),lib.validateParams(detail)];
					
					if(detail["x-router"]!=undefined&&detail["x-router"]["middleware"]!=undefined){
						subProcessList = lib.bindMiddleware(detail["x-router"]["middleware"],_middleware);
					}
					subProcessList.push(action[method]);
					console.log(processList.concat(subProcessList))
					r[method](...processList.concat(subProcessList));
					console.log(path,"inited");
				})
			}catch(e){
				console.log(path,e);
			}
		});	
	},
	bindMiddleware:function(middlewareList,_middleware){
		var result = []
		if(middlewareList==undefined){
			return result;
		}
		middlewareList.forEach((item)=>{
			try{
				switch(typeof(item)){
					case "string":
						if(_middleware[item]==undefined){
							throw "";
						}
						result.push(_middleware[item]);
						break;
					case "object":
						if(_middleware[item.name]==undefined){
							throw "";
						}
						result.push(_middleware[item.name](item.params))
						break;
					
				}
			}catch(e){
				
			}
		});
		return result;
	},
	bindParams:function({
		parameters=[]
	}){
		return (ctx,next)=>{
			if(parameters.length==0){
				return next();
			}
			var schema = {
				properties:{},
				required:[]
			};
			
			var data = {};
			
			parameters.forEach((item)=>{
				switch(item.in){
					case "header":
						data[item.name] = ctx.request.header[item.name];
						break;
					case "path":
						data[item.name] = ctx.params[item.name];
						break;
					case "body":
						if(ctx.is("json")){
							data[item.name] = ctx.request.body[item.name];
						}
						break;
					case "query":
						data[item.name] = ctx.query[item.name];
						break;
					case "formData":
						if(ctx.is("urlencoded")){
							data[item.name] = ctx.request.body[item.name];
						}else if(ctx.is("multipart")){
							if(item.type=="file"){
								data[item.name] = ctx.request.body.files[item.name];
							}else{
								data[item.name] = ctx.request.body.fields[item.name];
							}
						}
						break;
				}
			});
			ctx.swaggerParams = data;
			//next == validateParams
			return next();
		}
	},
	validateParams:function({
		parameters=[]
	}){
		return (ctx,next)=>{
			if(parameters.length==0){
				return next();
			}
			var schema = {
				properties:{},
				required:[]
			};
			
			parameters.forEach((item)=>{
				switch(item.in){
					case "header":
					case "path":
					case "query":
						schema.properties[item.name] = {
							type:item.type
						};
						break;
					case "body":
						if(ctx.is("json")){
							
						}
						break;
					case "formData":
						if(ctx.is("urlencoded")){
							schema.properties[item.name] ={
								type:item.type
							}
						}else if(ctx.is("multipart")){
							if(item.type=="file"){
								schema.properties[item.name]={
									type:"object"
								}
							}else{
								schema.properties[item.name]={
									type:item.type
								};
							}
						}
						break;
				}
				if(item.required)
				{
					schema.required.push(item.name);
				}
			});
			var validate = new Ajv().compile(schema);
			console.log(validate(ctx.swaggerParams));
			if(validate(ctx.swaggerParams)){
				return next();
			}else{
				throw validate.errors;
			}
		}
	}
}

module.exports = ({
	path="",
	controller={},
	middleware={}
})=>{
	_controller = controller;
	_middleware = middleware;
	
	lib.parserAPI(path).then((api)=>{
		_swagger = api;
		lib.initRouter(controller,middleware);
		console.log("parser swagger api success");
	}).catch((err)=>{
		console.log("parser swagger api error",err);
		throw "parse swagger api error";
	});

	return r.routes();
}


