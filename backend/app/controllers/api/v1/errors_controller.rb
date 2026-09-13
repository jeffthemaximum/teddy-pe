module Api
  module V1
    # Terminal handler for anything no controller caught: a routing miss, a
    # malformed JSON body, an exception raised in middleware. Answers in the
    # same envelope as every other failure.
    class ErrorsController < ApiController
      skip_before_action :authorize_request

      def show
        exception = request.env["action_dispatch.exception"]
        # A plain routing miss (no exception raised at all) reaches this
        # action directly through the catch-all route below, not through
        # exceptions_app, so there is nothing to unwrap: it is a 404.
        # ExceptionWrapper assumes a real exception and raises on nil.
        status = exception ? ActionDispatch::ExceptionWrapper.new(request.env, exception).status_code : 404
        code = status == 404 ? "not_found" : "server_error"
        message = status == 404 ? "Not found." : "Something went wrong."
        render_error(code, message, status)
      end
    end
  end
end
