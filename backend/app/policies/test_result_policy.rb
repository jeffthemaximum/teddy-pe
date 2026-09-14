# The coach records everything. Teddy records his own numbers, because typing
# them in is part of the ceremony. A viewer records nothing.
class TestResultPolicy < ApplicationPolicy
  def index?  = read_program?
  def create? = user.coach? || user.athlete?

  class Scope < Scope
    def resolve = user ? scope.all : scope.none
  end
end
