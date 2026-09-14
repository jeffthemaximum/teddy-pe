require "rails_helper"

RSpec.describe "errors reaching no controller action", type: :request do
  it "answers a routing miss in our envelope, not Rails' default shape" do
    get "/api/v1/nope"

    expect(response).to have_http_status(:not_found)
    body = JSON.parse(response.body)

    # Our shape: { "error" => { "code" => ..., "message" => ... } }.
    expect(body).to eq("error" => { "code" => "not_found", "message" => "Not found." })

    # Rails' own default 404 body is { "status" => 404, "error" => "Not Found" },
    # where "error" is a bare string. Confirm we are not that.
    expect(body["error"]).to be_a(Hash)
    expect(body).not_to have_key("status")
  end
end
