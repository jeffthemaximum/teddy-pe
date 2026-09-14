class ApplicationPolicy
  attr_reader :user, :record

  def initialize(user, record)
    @user = user
    @record = record
  end

  def index?   = false
  def show?    = false
  def create?  = false
  def update?  = false
  def destroy? = false

  # Everyone signed in can read the program itself. Journals and results
  # narrow this in their own policies.
  def read_program? = user.present?

  class Scope
    attr_reader :user, :scope

    def initialize(user, scope)
      @user = user
      @scope = scope
    end

    def resolve = scope.none
  end
end
