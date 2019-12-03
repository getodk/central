-- from http://www.pataliebre.net/howto-make-nginx-decompress-a-gzipped-request.html

ngx.ctx.max_chunk_size = tonumber(ngx.var.max_chunk_size)
ngx.ctx.max_body_size = tonumber(ngx.var.max_body_size)

function create_error_response (code, description)
  local message = string.format('{"status":400,"statusReason":"Bad Request","code":%d,"exception":"","description":"%s","message":"HTTP 400 Bad Request"}', code, description)
  ngx.status = ngx.HTTP_BAD_REQUEST
  ngx.header.content_type = "application/json"
  ngx.say(message)
  ngx.exit(ngx.HTTP_OK)
end

function inflate_chunk (stream, chunk)
  return stream(chunk)
end

function inflate_body (data)
  local stream = require("zlib").inflate()
  local buffer = ""
  local chunk = ""

  for index = 0, data:len(), ngx.ctx.max_chunk_size do
    chunk = string.sub(data, index, index + ngx.ctx.max_chunk_size - 1)
    local status, output, eof, bytes_in, bytes_out = pcall(stream, chunk)

    if not status then
      -- corrupted chunk
      ngx.log(ngx.ERR, output)
      create_error_response(4001, "Corrupted GZIP body")
    end

    if bytes_in == 0 and bytes_out == 0 then
      -- body is not gzip compressed
      create_error_response(4002, "Invalid GZIP body")
    end

    buffer = buffer .. output

    if bytes_out > ngx.ctx.max_body_size then
      -- uncompressed body too large
      create_error_response(4003, "Uncompressed body too large")
    end
  end

  return buffer
end


local content_encoding = ngx.req.get_headers()["Content-Encoding"]
if content_encoding == "gzip" then
  ngx.req.read_body()
  local data = ngx.req.get_body_data()

  if data == nil or data == '' then
    local file = io.open(ngx.req.get_body_file(), "r")
    data = file:read("*a")
    file:close()
  end

  if data ~= nil and data ~= '' then
    local new_data = inflate_body(data)

    ngx.req.clear_header("Content-Encoding")
    ngx.req.clear_header("Content-Length")
    ngx.req.set_body_data(new_data)
  end
end

